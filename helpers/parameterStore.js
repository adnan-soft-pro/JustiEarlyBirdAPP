/* eslint-disable consistent-return */
/* eslint-disable no-param-reassign */
/* eslint-disable no-console */
const AWS = require('aws-sdk');

const ssm = new AWS.SSM({ apiVersion: '2014-11-06', region: 'us-east-1' });

const env = process.env.NODE_ENV || 'local';

const getParametersPromise = (paramNamesList) => new Promise((resolve, reject) => {
  paramNamesList = paramNamesList.map((paramName) => `/${env}/${paramName}`);
  ssm.getParameters({ Names: paramNamesList, WithDecryption: true }, (err, data) => {
    if (err) {
      reject(err);
    } else {
      const params = data.Parameters.map((param) => ({ name: param.Name, value: param.Value }));
      resolve({ recievedParams: params, invalidParams: data.InvalidParameters });
    }
  });
});

const getParamsListFromParameterStore = async (paramNamesList /* : Object */) => {
  try {
    return await getParametersPromise(paramNamesList);
  } catch (err) {
    console.log(err.message);
  }
};

module.exports = { getParamsListFromParameterStore };
