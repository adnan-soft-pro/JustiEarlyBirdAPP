module.exports = (req, res, next) => {
  try {
    if (req.user.is_admin) return next();
    return res.status(403).send('You are not an admin');
  } catch (err) {
    res.status(403).send('You are not an admin');
  }
};
