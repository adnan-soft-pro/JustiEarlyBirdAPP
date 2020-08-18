/* eslint-disable import/order */
/* eslint-disable no-underscore-dangle */
const request = require('supertest');
const app = require('../app');
const config = require('../config').app;
const stripe = require('stripe')(config.stripeSecret);
const ProjectModel = require('../models/project');
const UserModel = require('../models/user');
const authUser = require('./helpers/authUser');

// eslint-disable-next-line no-unused-vars
const server = request(app);

let user; let header; let project; let
  payentId;

afterAll(async () => {
  await ProjectModel.deleteMany({});
  await UserModel.deleteMany({});
});

beforeAll(async () => {
  await ProjectModel.deleteMany({});
  await UserModel.deleteMany({});
  const currentUser = await authUser();
  header = currentUser.headers.authorization;
  user = currentUser.data;
});

describe('Create project', () => {
  it('should create project', async () => {
    const res = await request(app)
      .post('/projects')
      .send({
        site_type: 'IG',
        email: 'test',
        password: 'test',
        url: 'https://www.indiegogo.com/projects/seven-me-make-coffee-espresso-at-home-in-3-mins--2#/',
        run_option: 1,
      })
      .set({ authorization: header });
    project = res.body;
    expect(res.statusCode).toEqual(200);
  });
});

const timeout = (ms) => new Promise((res) => setTimeout(res, ms));
describe('Create later plan', () => {
  it('should create  later plan', async () => {
    const paymentMethod = await stripe.paymentMethods.create({
      type: 'card',
      card: {
        number: '4242424242424242',
        exp_month: 8,
        exp_year: 2021,
        cvc: '314',
      },
    });
    payentId = paymentMethod.id;

    await stripe.paymentMethods.attach(
      paymentMethod.id,
      { customer: user.stripe_id },
    );

    await stripe.setupIntents.create({
      confirm: true,
      customer: user.stripe_id,
      usage: 'off_session',
      payment_method: payentId,
      metadata: {
        projectId: project._id,
      },
    });
    await timeout(2000);
    expect(200).toEqual(200);
  });
});

describe('Update later plan project', () => {
  it('should update later plan project', async () => {
    const res = await request(app)
      .put(`/projects/${project._id}`)
      .send({
        project,
        is_trialing: false,
        initial_debt: 1500,
        debt: 1500,
      })
      .set({ authorization: header });
    await timeout(1000);
    expect(res.statusCode).toEqual(200);
  });
});

describe('finish later plan subscription', () => {
  it('should finish later plan subscription', async () => {
    const res = await request(app)
      .post(`/projects/${project._id}/finish`)
      .set({ authorization: header });

    expect(res.body.charge_flow_status).toEqual('scheduled');
  });
});

describe('pay later plan subscription', () => {
  it('should pay for later plan subscription', async () => {
    const res = await request(app)
      .post(`/projects/${project._id}/pay`)
      .set({ authorization: header });
    expect(res.statusCode).toEqual(200);
    await timeout(2000);
  });
});

describe('Delete project', () => {
  it('should delete project', async () => {
    const res = await request(app)
      .delete(`/projects/${project._id}`)
      .set({ authorization: header });

    expect(res.statusCode).toEqual(200);
  });
});

describe('Delete user', () => {
  it('should delete user', async () => {
    const res = await request(app)
      .delete(`/users/${user._id}`)
      .set({ authorization: header });

    expect(res.statusCode).toEqual(200);
  });
});
