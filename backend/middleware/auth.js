const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');

const protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ error: 'Not authorized. No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, name, role, roll_number, department, semester, avatar, is_active')
      .eq('id', decoded.id)
      .single();

    if (error || !user || !user.is_active) {
      return res.status(401).json({ error: 'User not found or inactive.' });
    }

    req.user = {
      ...user,
      _id: user.id,
      rollNumber: user.roll_number,
      isActive: user.is_active
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalid or expired.' });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: `Access denied. Requires role: ${roles.join(' or ')}` });
  }
  next();
};

module.exports = { protect, requireRole };
