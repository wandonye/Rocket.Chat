#!/bin/bash
set -x
set -euvo pipefail
IFS=$'\n\t'

# export METEOR_SETTINGS=$(cat settings.json)
export NODE_ENV=production
meteor add rocketchat:internal-hubot meteorhacks:kadira
meteor build --server https://chat.linknitive.com --directory ~/rocket.chat
cd ~/rocket.chat/bundle/programs/server
npm install
meteor npm install --save babel-runtime moment toastr
gtar zcf linknitive.tar.gz ~/rocket.chat/bundle
# cd /var/www/rocket.chat/current
# pm2 startOrRestart /var/www/rocket.chat/current/pm2.json
