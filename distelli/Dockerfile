FROM rocketchat/base:4

ENV RC_VERSION latest

MAINTAINER dongning.wang@gmail.com

VOLUME /app/uploads
COPY ./bundle /app/bundle

RUN set -x \
  && cd /app/bundle/programs/server \
  && npm install \
  && npm cache clear

USER rocketchat

WORKDIR /app/bundle

# needs a mongoinstance - defaults to container linking with alias 'mongo'
ENV MONGO_URL=mongodb://db:27017/rocketchat \
    HOME=/tmp \
    PORT=3000 \
    ROOT_URL=http://localhost:3000 \
    Accounts_AvatarStorePath=/app/uploads

EXPOSE 3000

CMD ["node", "main.js"]
