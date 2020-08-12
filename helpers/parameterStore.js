/* eslint-disable no-console */
const AWS = require('aws-sdk');

const ssm = new AWS.SSM({ apiVersion: '2014-11-06', region: 'eu-central-1' });

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

const updateParametersPromise = (params) => new Promise((resolve, reject) => {
  ssm.putParameter({
    Name: `/${env}/${params.name}`, Value: params.value, Type: params.dataType, Overwrite: true,
  }, (err, data) => {
    if (err) {
      reject(err);
    } else {
      resolve(data);
    }
  });
});

const updateParamsFromParameterStore = async (paramNamesList /* : Object */) => {
  try {
    return await updateParametersPromise(paramNamesList);
  } catch (err) {
    console.log(err.message);
  }
};

const getParamsListFromParameterStore = async (paramNamesList /* : Object */) => {
  try {
    return await getParametersPromise(paramNamesList);
  } catch (err) {
    console.log(err.message);
  }
};

module.exports = { getParamsListFromParameterStore, updateParamsFromParameterStore };
