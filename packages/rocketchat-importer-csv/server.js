/* globals Importer */

Importer.CSV = class ImporterCSV extends Importer.Base {
	constructor(name, descriptionI18N, fileTypeRegex) {
		super(name, descriptionI18N, fileTypeRegex);
		this.logger.debug('Constructed a new CSV Importer.');

		this.csvParser = Npm.require('csv-parse/lib/sync');
		this.messages = new Map();
	}

	prepare(dataURI, sentContentType, fileName) {
		super.prepare(dataURI, sentContentType, fileName);

		const uriResult = RocketChatFile.dataURIParse(dataURI);
		const zip = new this.AdmZip(new Buffer(uriResult.image, 'base64'));
		const zipEntries = zip.getEntries();

		let tempChannels = [];
		let tempUsers = [];
		const tempMessages = new Map();
		for (let entry of zipEntries) {
			this.logger.debug(`Entry: ${entry.entryName}`);

			//Ignore anything that has `__MACOSX` in it's name, as sadly these things seem to mess everything up
			if (entry.entryName.indexOf('__MACOSX') > -1) {
				this.logger.debug(`Ignoring the file: ${entry.entryName}`);
				continue;
			}

			//Directories are ignored, since they are "virtual" in a zip file
			if (entry.isDirectory) {
				this.logger.debug(`Ignoring the directory entry: ${entry.entryName}`);
				continue;
			}

			//Parse the channels
			if (entry.entryName.toLowerCase() === 'channels.csv') {
				super.updateProgress(Importer.ProgressStep.PREPARING_CHANNELS);
				const parsedChannels = this.csvParser(entry.getData().toString());
				tempChannels = parsedChannels.map((c) => {
					return {
						id: c[0].trim().replace('.', '_'),
						name: c[0].trim(),
						creator: c[1].trim(),
						isPrivate: c[2].trim().toLowerCase() === 'private' ? true : false,
						members: c[3].trim().split(';').map((m) => m.trim())
					};
				});
				continue;
			}

			//Parse the users
			if (entry.entryName.toLowerCase() === 'users.csv') {
				super.updateProgress(Importer.ProgressStep.PREPARING_USERS);
				const parsedUsers = this.csvParser(entry.getData().toString());
				tempUsers = parsedUsers.map((u) => { return { id: u[0].trim().replace('.', '_'), username: u[0].trim(), email: u[1].trim(), name: u[2].trim() }; });
				continue;
			}

			//Parse the messages
			if (entry.entryName.indexOf('/') > -1) {
				const item = entry.entryName.split('/'); //random/messages.csv
				const channelName = item[0]; //random
				const msgGroupData = item[1].split('.')[0]; //2015-10-04

				if (!tempMessages.get(channelName)) {
					tempMessages.set(channelName, new Map());
				}

				let msgs = [];

				try {
					msgs = this.csvParser(entry.getData().toString());
				} catch (e) {
					this.logger.warn(`The file ${entry.entryName} contains invalid syntax`, e);
					continue;
				}

				tempMessages.get(channelName).set(msgGroupData, msgs.map((m) => { return { username: m[0], ts: m[1], text: m[2] }; }));
				continue;
			}
		}

		// Insert the users record, eventually this might have to be split into several ones as well
		// if someone tries to import a several thousands users instance
		const usersId = this.collection.insert({ 'import': this.importRecord._id, 'importer': this.name, 'type': 'users', 'users': tempUsers });
		this.users = this.collection.findOne(usersId);
		super.updateRecord({ 'count.users': tempUsers.length });
		super.addCountToTotal(tempUsers.length);

		// Insert the channels records.
		const channelsId = this.collection.insert({ 'import': this.importRecord._id, 'importer': this.name, 'type': 'channels', 'channels': tempChannels });
		this.channels = this.collection.findOne(channelsId);
		super.updateRecord({ 'count.channels': tempChannels.length });
		super.addCountToTotal(tempChannels.length);

		// Save the messages records to the import record for `startImport` usage
		super.updateProgress(Importer.ProgressStep.PREPARING_MESSAGES);
		let messagesCount = 0;
		for (let [channel, messagesMap] of tempMessages.entries()) {
			if (!this.messages.get(channel)) {
				this.messages.set(channel, new Map());
			}

			for (let [msgGroupData, msgs] of messagesMap.entries()) {
				messagesCount += msgs.length;
				super.updateRecord({ 'messagesstatus': `${channel}/${msgGroupData}` });

				if (Importer.Base.getBSONSize(msgs) > Importer.Base.MaxBSONSize) {
					Importer.Base.getBSONSafeArraysFromAnArray(msgs).forEach((splitMsg, i) => {
						const messagesId = this.collection.insert({ 'import': this.importRecord._id, 'importer': this.name, 'type': 'messages', 'name': `${channel}/${msgGroupData}.${i}`, 'messages': splitMsg });
						this.messages.get(channel).set(`${msgGroupData}.${i}`, this.collection.findOne(messagesId));
					});
				} else {
					const messagesId = this.collection.insert({ 'import': this.importRecord._id, 'importer': this.name, 'type': 'messages', 'name': `${channel}/${msgGroupData}`, 'messages': msgs });
					this.messages.get(channel).set(msgGroupData, this.collection.findOne(messagesId));
				}
			}
		}

		super.updateRecord({ 'count.messages': messagesCount, 'messagesstatus': null });
		super.addCountToTotal(messagesCount);

		//Ensure we have some users, channels, and messages
		if (tempUsers.length === 0 || tempChannels.length === 0 || messagesCount === 0) {
			this.logger.warn(`The loaded users count ${tempUsers.length}, the loaded channels ${tempChannels.length}, and the loaded messages ${messagesCount}`);
			super.updateProgress(Importer.ProgressStep.ERROR);
			return super.getProgress();
		}

		const selectionUsers = tempUsers.map((u) => new Importer.SelectionUser(u.id, u.username, u.email, false, false, true));
		const selectionChannels = tempChannels.map((c) => new Importer.SelectionChannel(c.id, c.name, false, true, c.isPrivate));

		super.updateProgress(Importer.ProgressStep.USER_SELECTION);
		return new Importer.Selection(this.name, selectionUsers, selectionChannels);
	}

	startImport(importSelection) {
		super.startImport(importSelection);
		const started = Date.now();

		//Ensure we're only going to import the users that the user has selected
		for (let user of importSelection.users) {
			for (let u of this.users.users) {
				if (u.id === user.user_id) {
					u.do_import = user.do_import;
				}
			}
		}
		this.collection.update({ _id: this.users._id }, { $set: { 'users': this.users.users }});

		//Ensure we're only importing the channels the user has selected.
		for (let channel of importSelection.channels) {
			for (let c of this.channels.channels) {
				if (c.id === channel.channel_id) {
					c.do_import = channel.do_import;
				}
			}
		}
		this.collection.update({ _id: this.channels._id }, { $set: { 'channels': this.channels.channels }});

		const startedByUserId = Meteor.userId();
		Meteor.defer(() => {
			super.updateProgress(Importer.ProgressStep.IMPORTING_USERS);
			//Import the users
			for (let u of this.users.users) {
				if (!u.do_import) {
					continue;
				}

				Meteor.runAsUser(startedByUserId, () => {
					let existantUser = RocketChat.models.Users.findOneByEmailAddress(u.email);

					//If we couldn't find one by their email address, try to find an existing user by their username
					if (!existantUser) {
						existantUser = RocketChat.models.Users.findOneByUsername(u.username);
					}

					if (existantUser) {
						//since we have an existing user, let's try a few things
						u.rocketId = existantUser._id;
						RocketChat.models.Users.update({ _id: u.rocketId }, { $addToSet: { importIds: u.id } });
					} else {
						const userId = Accounts.createUser({ email: u.email, password: Date.now() + u.name + u.email.toUpperCase() });
						Meteor.runAsUser(userId, () => {
							Meteor.call('setUsername', u.username, {joinDefaultChannelsSilenced: true});
							RocketChat.models.Users.setName(userId, u.name);
							RocketChat.models.Users.update({ _id: userId }, { $addToSet: { importIds: u.id } });
							u.rocketId = userId;
						});
					}

					super.addCountCompleted(1);
				});
			}
			this.collection.update({ _id: this.users._id }, { $set: { 'users': this.users.users }});

			//Import the channels
			super.updateProgress(Importer.ProgressStep.IMPORTING_CHANNELS);
			for (let c of this.channels.channels) {
				if (!c.do_import) {
					continue;
				}

				Meteor.runAsUser(startedByUserId, () => {
					let existantRoom = RocketChat.models.Rooms.findOneByName(c.name);
					//If the room exists or the name of it is 'general', then we don't need to create it again
					if (existantRoom || c.name.toUpperCase() === 'GENERAL') {
						c.rocketId = c.name.toUpperCase() === 'GENERAL' ? 'GENERAL' : existantRoom._id;
						RocketChat.models.Rooms.update({ _id: c.rocketId }, { $addToSet: { importIds: c.id } });
					} else {
						//Find the rocketchatId of the user who created this channel
						let creatorId = startedByUserId;
						for (let u of this.users.users) {
							if (u.username === c.creator && u.do_import) {
								creatorId = u.rocketId;
							}
						}

						//Create the channel
						Meteor.runAsUser(creatorId, () => {
							const roomInfo = Meteor.call(c.isPrivate ? 'createPrivateGroup' : 'createChannel', c.name, c.members);
							c.rocketId = roomInfo.rid;
						});

						RocketChat.models.Rooms.update({ _id: c.rocketId }, { $addToSet: { importIds: c.id } });
					}

					super.addCountCompleted(1);
				});
			}
			this.collection.update({ _id: this.channels._id }, { $set: { 'channels': this.channels.channels }});

			//Import the Messages
			super.updateProgress(Importer.ProgressStep.IMPORTING_MESSAGES);
			for (let [ch, messagesMap] of this.messages.entries()) {
				const csvChannel = this.getChannelFromName(ch);
				if (!csvChannel.do_import) {
					continue;
				}

				const room = RocketChat.models.Rooms.findOneById(csvChannel.rocketId, { fields: { usernames: 1, t: 1, name: 1 } });
				Meteor.runAsUser(startedByUserId, () => {
					for (let [msgGroupData, msgs] of messagesMap.entries()) {
						super.updateRecord({ 'messagesstatus': `${ch}/${msgGroupData}.${msgs.messages.length}` });
						for (let msg of msgs.messages) {
							if (isNaN(new Date(parseInt(msg.ts)))) {
								this.logger.warn(`Timestamp on a message in ${ch}/${msgGroupData} is invalid`);
								super.addCountCompleted(1);
								continue;
							}

							const creator = this.getUserFromUsername(msg.username);
							if (creator) {
								const msgObj = {
									_id: `csv-${csvChannel.id}-${msg.ts}`,
									ts: new Date(parseInt(msg.ts)),
									msg: msg.text,
									rid: room._id,
									u: {
										_id: creator._id,
										username: creator.username
									}
								};

								RocketChat.sendMessage(creator, msgObj, room, true);
							}

							super.addCountCompleted(1);
						}
					}
				});
			}

			super.updateProgress(Importer.ProgressStep.FINISHING);
			super.updateProgress(Importer.ProgressStep.DONE);
			const timeTook = Date.now() - started;
			this.logger.log(`CSV Import took ${timeTook} milliseconds.`);
		});

		return super.getProgress();
	}

	getSelection() {
		const selectionUsers = this.users.users.map((u) => new Importer.SelectionUser(u.id, u.username, u.email, false, false, true));
		const selectionChannels = this.channels.channels.map((c) => new Importer.SelectionChannel(c.id, c.name, false, true, c.isPrivate));

		return new Importer.Selection(this.name, selectionUsers, selectionChannels);
	}

	getChannelFromName(channelName) {
		for (let ch of this.channels.channels) {
			if (ch.name === channelName) {
				return ch;
			}
		}
	}

	getUserFromUsername(username) {
		for (let u of this.users.users) {
			if (u.username === username) {
				return RocketChat.models.Users.findOneById(u.rocketId, { fields: { username: 1 }});
			}
		}
	}
};
