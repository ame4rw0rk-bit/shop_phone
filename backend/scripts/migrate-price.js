const { sequelize } = require('../models');

async function migratePriceColumn() {
  try {
    await sequelize.authenticate();
    console.log('✅ متصل بقاعدة البيانات');

    // تغيير نوع عمود price من FLOAT إلى VARCHAR(50)
    await sequelize.query(`
      ALTER TABLE products 
      MODIFY COLUMN price VARCHAR(50) NOT NULL DEFAULT '0'
    `);
    
    console.log('✅ تم تغيير نوع عمود price إلى VARCHAR(50)');
    
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ خطأ:', error.message);
    process.exit(1);
  }
}

migratePriceColumn();
