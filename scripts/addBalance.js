require('dotenv').config();  // 加载环境变量
const mongoose = require('mongoose');
const path = require('path');

// 定义 Balance Schema
const balanceSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tokenCredits: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// 创建 Balance 模型
const Balance = mongoose.model('Balance', balanceSchema);

async function addBalanceToUser() {
  try {
    // 连接数据库
    const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017/AiDB';
    await mongoose.connect(MONGODB_URL);
    console.log('Connected to MongoDB');
    
    // 设置用户ID和余额
    const userId = '67145dba8b9985e7d4138c8f';  // 需要替换成您的实际用户ID
    const initialBalance = 10000000; // $10.00
    
    // 创建或更新余额
    const balance = await Balance.findOneAndUpdate(
      { user: userId },
      { $set: { tokenCredits: initialBalance } },
      { upsert: true, new: true }
    );
    
    console.log('Balance updated successfully:', balance);
  } catch (error) {
    console.error('Error adding balance:', error);
    console.error('Error details:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

// 运行函数
addBalanceToUser();
