const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/geological3d', {
      serverSelectionTimeoutMS: 5000,
    });
    console.log('MongoDB Connected');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    console.log('Using mock data mode (no MongoDB)');
  }
};

module.exports = connectDB;
