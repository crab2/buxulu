const cloud = require('wx-server-sdk');
const { handle } = require('./service.js');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = (event) => handle(cloud, event, Date.now());
