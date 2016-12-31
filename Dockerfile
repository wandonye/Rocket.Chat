FROM rocketchat/base:4

ENV RC_VERSION latest

MAINTAINER dongning.wang@gmail.com

VOLUME /app/uploads

RUN set -x \
  && curl "https://s3-us-west-2.amazonaws.com/elasticbeanstalk-us-west-2-179654900482/linknitive.tar.gz" -o linknitive.tar.gz \
  && tar -zxf linknitive.tar.gz -C /app \
  && rm -rf linknitive.tar.gz \
  && cd /app/bundle/programs/server \
  && npm install \
  && npm install --save babel-runtime moment toastr bcrypt \
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
