// Cloud function entry. All rules live in service.js and ledger.js, so they can be tested offline.
const cloud = require('wx-server-sdk');
const { handle } = require('./service.js');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = (event) => handle(cloud, event, Date.now());
