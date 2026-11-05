const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Product = sequelize.define('Product', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  title: {
    type: DataTypes.STRING(140),
    allowNull: false,
    validate: { notEmpty: true, len: [2, 140] }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  price: {
    type: DataTypes.FLOAT,
    allowNull: false,
    validate: { min: 0 }
  },
  imageUrl: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  inStock: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false
  },
  condition: {
    type: DataTypes.ENUM('new', 'used'),
    defaultValue: 'new',
    allowNull: false
  }
}, {
  tableName: 'products',
  timestamps: true
});

Product.SORTABLE_FIELDS = {
  newest: ['createdAt', 'DESC'],
  oldest: ['createdAt', 'ASC'],
  price_asc: ['price', 'ASC'],
  price_desc: ['price', 'DESC'],
  title: ['title', 'ASC']
};

module.exports = Product;
