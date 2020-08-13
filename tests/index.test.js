const request = require('supertest');
const app = require('../app');
const config = require('../config').app;
const stripe = require('stripe')(config.stripeSecret);

const server = request(app);

const aQuestionId = '5f3101adce4dd22b78225f8e';

// test('get /user/:id', async (done) => {
//   jest.setTimeout(30000);
//   server
//   // /questions/5c7899a24552624a5b9c7f35?_method=DELETE
//     .get(`/user/${aQuestionId}`)
//     .expect(200);
// });
let user;
let header;
let project;
// describe('Sign in', () => {
//   it('should create a new user', async () => {
//     const res = await request(app)
//       .post('/auth/register')
//       .send({
//         email: 'jest@jest.com',
//         password: 'test',
//         fullname: 'jest test',
//       });
//     console.log('signin', res.body);
//     user = res.body;
//     expect(res.body.email).toEqual('jest@jest.com');
//   });
// });

describe('login', () => {
  it('should login user', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({
        password: 'test',
        email: 'jest@jest.com',
      });
    header = res.header.authorization;
    user = res.body;
    expect(res.statusCode).toEqual(200);
  });
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
    const nowPlanId = 'price_1HCREbGWiMg5OKtoC7uzsSe8';
    const paymentMethod = await stripe.paymentMethods.create({
      type: 'card',
      card: {
        number: '4242424242424242',
        exp_month: 8,
        exp_year: 2021,
        cvc: '314',
      },
    });

    const attach = await stripe.paymentMethods.attach(
      paymentMethod.id,
      { customer: user.stripe_id },
    );

    const subscription = await stripe.subscriptions.create({
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

describe('Update project', () => {
  it('should update project', async () => {
    const res = await request(app)
      .put(`/projects/${project._id}`)
      .send({
        project,
        is_payment_active: true,
        is_trialing: false,
        plan: 'now_plan',
      })
      .set({ authorization: header });
    // console.log(res);
    expect(res.statusCode).toEqual(200);
  });
});

describe('Get project', () => {
  it('should get project by id', async () => {
    const res = await request(app)
      .get(`/projects/${project._id}`)
      .set({ authorization: header });
    project = res.body;

    expect(res.statusCode).toEqual(200);
  });
});

jest.setTimeout(60000);

describe('finish subscription', () => {
  it('should finish subscription', async () => {
    const res = await request(app)
      .post(`/projects/${project._id}/finish`)
      .set({ authorization: header });
    expect(res.statusCode).toEqual(200);
  });
});
jest.setTimeout(60000);
describe('Delete project', () => {
  it('should delete project', async () => {
    const res = await request(app)
      .delete(`/projects/${project._id}`)
      .set({ authorization: header });

    expect(res.statusCode).toEqual(200);
  });
});

// describe('get Endpoints', () => {
//   it('should get a user', async () => {
//     const res = await request(app)
//       .get(`/admin/user/${aQuestionId}`);
//     expect(res.statusCode).toEqual(200);
//   });

//   // expect(res.body).toHaveProperty('post')
// });
// describe('Pay', () => {
//   it('should finish subscription', async () => {
//     const res = await request(app)
//       .post('/projects/5f33a89a2624572f87bd8a73/finish')
//       .set({ authorization: header });
//     // console.log(res);
//     console.log(res);
//     expect(res.statusCode).toEqual(200);
//   });
// });

// Delete route
// DELETE /questions/:qID
