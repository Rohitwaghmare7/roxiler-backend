const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  id: {
    type: Number,
    unique: true,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true
  },
  image: {
    type: String,
    required: true
  },
  sold: {
    type: Boolean,
    required: true
  },
  dateOfSale: {
    type: Date,
    required: true
  }
});

// Create and export the Product model
module.exports = mongoose.model('Product', ProductSchema);
