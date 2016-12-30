#!/bin/bash
set -x
set -euvo pipefail
IFS=$'\n\t'

export METEOR_SETTINGS=$(cat settings.json)
export NODE_ENV=production
meteor add rocketchat:internal-hubot meteorhacks:kadira
meteor build --server https://demo.rocket.chat --directory /Users/Danny/rocket.chat
cd /Users/Danny/rocket.chat/bundle/programs/server
npm install
cd /Users/Danny/rocket.chat/current
pm2 startOrRestart /Users/Danny/rocket.chat/current/pm2.json
