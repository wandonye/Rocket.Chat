FROM rocketchat/base:4

ENV RC_VERSION latest

MAINTAINER dongning.wang@gmail.com

COPY ./bundle /app/bundle
VOLUME /app/uploads

RUN set -x \
  && curl -SLf "https://rocket.chat/releases/${RC_VERSION}/download" -o rocket.chat.tgz \
  && curl -SLf "https://rocket.chat/releases/${RC_VERSION}/asc" -o rocket.chat.tgz.asc \
  && gpg --verify rocket.chat.tgz.asc \
  && tar -zxf rocket.chat.tgz -C /tmp/app \
  && mv /tmp/app/bundle/programs/server/npm /app/bundle/programs/server/npm \
  && rm -rf /tmp/app rocket.chat.tgz rocket.chat.tgz.asc \
  && cd /app/bundle/programs/server \
  && npm install \
  && npm cache clear

USER rocketchat

WORKDIR /app/bundle

# needs a mongoinstance - defaults to container linking with alias 'mongo'
ENV MONGO_URL=mongodb://mongo:27017/rocketchat \
    HOME=/tmp \
    PORT=3000 \
    ROOT_URL=http://localhost:3000 \
    Accounts_AvatarStorePath=/app/uploads

EXPOSE 3000

CMD ["node", "main.js"]
