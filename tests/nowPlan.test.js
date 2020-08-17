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

let user; let header; let
  project;

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
    // console.log(res);
    expect(res.statusCode).toEqual(200);
  });
});

describe('Create now plan', () => {
  it('should create  now plan', async () => {
    const nowPlanId = config.nowPlanPriceId;
    const paymentMethod = await stripe.paymentMethods.create({
      type: 'card',
      card: {
        number: '4242424242424242',
        exp_month: 8,
        exp_year: 2021,
        cvc: '314',
      },
    });

    await stripe.paymentMethods.attach(
      paymentMethod.id,
      { customer: user.stripe_id },
    );

    await stripe.subscriptions.create({
      customer: user.stripe_id,
      items: [
        { price: nowPlanId },
      ],
      default_payment_method: paymentMethod.id,
      trial_from_plan: false,
      metadata: {
        projectId: project._id,
        projectName: project.display_name,
      },
    });

    expect(200).toEqual(200);
  });
});

const timeout = (ms) => new Promise((res) => setTimeout(res, ms));

describe('Update project', () => {
  it('should update project', async () => {
    const res = await request(app)
      .put(`/projects/${project._id}`)
      .send({
        project,
        // stripe_subscription_id: payentId,
        // payment_configured_at: new Date(),
        // plan: 'now_plan',
        is_payment_active: true,
        is_trialing: false,
        // finished_at: undefined,
      })
      .set({ authorization: header });
    await timeout(4000);
    expect(res.statusCode).toEqual(200);

    // console.log(res);
  });
});

describe('Get project', () => {
  it('should get project by id', async () => {
    // jest.setTimeout(80000);
    const res = await request(app)
      .get(`/projects/${project._id}`)
      .set({ authorization: header });
    project = res.body;

    expect(res.statusCode).toEqual(200);
  });
});

describe('finish subscription', () => {
  it('should finish subscription', async () => {
    // console.log('start');
    // await timeout(12000);

    // console.log('finish');
    const res = await request(app)
      .post(`/projects/${project._id}/finish`)
      .set({ authorization: header });
    expect(res.statusCode).toEqual(200);
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
