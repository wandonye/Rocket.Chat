#!/bin/bash
set -x
set -euvo pipefail
IFS=$'\n\t'

# export METEOR_SETTINGS=$(cat settings.json)
export NODE_ENV=production
meteor npm install --save babel-runtime moment toastr
npm install --$NODE_ENV
meteor add rocketchat:internal-hubot meteorhacks:kadira
meteor build --server http://localhost --directory ~/rocket.chat
cd ~/rocket.chat/bundle/programs/server
npm install
gtar zcf ~/rocket.chat/linknitive.tar.gz ~/rocket.chat/bundle
# cd /var/www/rocket.chat/current
# pm2 startOrRestart /var/www/rocket.chat/current/pm2.json
