#!/bin/bash
set -x
set -euvo pipefail
IFS=$'\n\t'

export METEOR_SETTINGS=$(cat settings.json)
export NODE_ENV=production
npm install babel-runtime moment toastr bcrypt dtrace-provider
npm install --$NODE_ENV
meteor add rocketchat:internal-hubot meteorhacks:kadira
meteor build --server http://localhost --directory ~/linknitive
cd ~/linknitive/
gtar zcf linknitive.tar.gz ./bundle
cd ~/linknitive/bundle/programs/server
npm install
# cd /var/www/rocket.chat/current
# pm2 startOrRestart /var/www/rocket.chat/current/pm2.json
