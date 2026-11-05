const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const RecoveryCode = sequelize.define('Recovery_code', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  username: {
    type: DataTypes.STRING(15),
    unique: true,
    allowNull: false,
    validate: { notEmpty: true }
  },
  // bcrypt hash لكود الاسترجاع — لا يُخزَّن ولا يُرسل كنص صريح
  Recovery_code: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: { notEmpty: true }
  }
}, {
  tableName: 'recovery_codes',
  timestamps: true,
  defaultScope: {
    attributes: { exclude: ['Recovery_code'] }
  },
  scopes: {
    withSecret: { attributes: { exclude: [] } }
  }
});

module.exports = RecoveryCode;
