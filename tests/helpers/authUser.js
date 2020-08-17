const axios = require('axios');
const config = require('../../config').app;

const auth = async () => {
  await axios.default.post(`http://localhost:${config.port}/auth/register`, {
    email: 'jest@jest.com',
    password: 'test',
    fullname: 'jest test',
  });
  const currentUser = await axios.default.post(`http://localhost:${config.port}/auth/login`, {
    email: 'jest@jest.com',
    password: 'test',
    fullname: 'jest test',
  });

  return currentUser;
};
module.exports = auth;
