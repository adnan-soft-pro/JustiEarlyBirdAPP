const AWS = require('aws-sdk');

const ssm = new AWS.SSM({ apiVersion: '2014-11-06', region: 'us-east-1' });

const getParamsFromParameterStore = (paramNamesList) => new Promise((resolve, reject) => {
  ssm.getParameters(
    {
      Names: paramNamesList.map((paramName) => `/${process.env.NODE_ENV || 'local'}/${paramName}`),
      WithDecryption: true,
    },

    (err, { Parameters, InvalidParameters }) => {
      if (err) reject(err);
      else {
        resolve({
          recievedParams: Parameters.map((p) => ({ name: p.Name, value: p.Value })),
          invalidParams: InvalidParameters,
        });
      }
    },
  );
});

module.exports = { getParamsFromParameterStore };
