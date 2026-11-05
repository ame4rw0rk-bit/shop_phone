const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const USERNAME_RE = /^[a-z0-9_.]{4,15}$/;
const PASS_KEY_RE = /^(?=.*[A-Za-z])(?=.*\d).{16}$/;

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(60),
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [2, 60]
    }
  },
  username: {
    type: DataTypes.STRING(15),
    unique: true,
    allowNull: false,
    validate: {
      notEmpty: true,
      is: USERNAME_RE
    }
  },
  // يُخزَّن bcrypt hash فقط؛ لا يُقرأ أبداً في أي استجابة
  pass_key: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  role: {
    type: DataTypes.ENUM('user', 'ameer_OxAmeer_admin'),
    defaultValue: 'user',
    allowNull: false
  }
}, {
  tableName: 'users',
  timestamps: true,
  defaultScope: {
    attributes: { exclude: ['pass_key'] }
  },
  scopes: {
    withSecret: { attributes: { exclude: [] } }
  }
});

User.USERNAME_RE = USERNAME_RE;
User.PASS_KEY_RE = PASS_KEY_RE;

User.prototype.toSafeJSON = function toSafeJSON() {
  return { id: this.id, name: this.name, username: this.username, role: this.role };
};

module.exports = User;
