const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const User = require('./user');
const Product = require('./product');
const RecoveryCode = require('./Recovery_Code');

const Favorite = sequelize.define('Favorite', {
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    primaryKey: true
  },
  productId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    primaryKey: true
  }
}, {
  tableName: 'favorites',
  timestamps: true
});

User.belongsToMany(Product, {
  through: Favorite,
  as: 'favoriteProducts',
  foreignKey: 'userId',
  otherKey: 'productId'
});

Product.belongsToMany(User, {
  through: Favorite,
  as: 'favoritedBy',
  foreignKey: 'productId',
  otherKey: 'userId'
});

const syncModels = () => sequelize.sync();

module.exports = { sequelize, User, Product, Favorite, RecoveryCode, syncModels };
