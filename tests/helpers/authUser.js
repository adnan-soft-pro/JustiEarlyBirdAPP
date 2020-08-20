const request = require('supertest');
const app = require('../../app');

const auth = async () => {
  await request(app)
    .post('/auth/register')
    .send({
      email: 'jest@jest.com',
      password: 'test',
      fullname: 'jest test',
    });
  const currentUser = await request(app)
    .post('/auth/login')
    .send({
      email: 'jest@jest.com',
      password: 'test',
      fullname: 'jest test',
    });

  return currentUser;
};
module.exports = auth;
