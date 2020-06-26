const jwt = require('jsonwebtoken');

module.exports = function (auth) {

  return async function (req, res, next) {
    try {
      if (auth) {

        if (!ctx.request.headers["authorization"]) return res.status(404).send('you are not authorized');

        const token = ctx.request.headers["authorization"].replace("Bearer ", "");
        const decodedToken = jwt.decode(token, process.env.TOKEN_SECRET);

        const user = await UserModel.findOne({ _id: decodedToken.id});
        
        await next()
      }
    } catch (err) {
      res.status(404).send('you are not authorized');
    }

  }
}