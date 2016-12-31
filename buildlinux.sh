#!/bin/bash
set -x
set -euvo pipefail
IFS=$'\n\t'

# export METEOR_SETTINGS=$(cat settings.json)
export NODE_ENV=production
meteor npm install --save babel-runtime moment toastr
npm install --$NODE_ENV
meteor add rocketchat:internal-hubot meteorhacks:kadira
meteor build --server https://chat.linknitive.com --directory ~/rocket.chat --architecture os.linux.x86_64
cd ~/rocket.chat/
gtar zcf linknitive.tar.gz ./bundle
# cd /var/www/rocket.chat/current
# pm2 startOrRestart /var/www/rocket.chat/current/pm2.json
