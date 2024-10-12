const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const axios = require('axios');
const Product = require('./models/Product');
const app = express();
const PORT = process.env.PORT || 5000;
const cors = require('cors');

const mongoURI = 'mongodb+srv://RafatNaaz:Raaz%40.0425@cluster0.q6cb9.mongodb.net/Products';

mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB connection error:', err));

app.set('view engine', 'ejs');

app.use(cors());

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', async (req, res) => {
  try {
    const { data } = await axios.get('https://s3.amazonaws.com/roxiler.com/product_transaction.json');

    for (const item of data) {
      const existingProduct = await Product.findOne({ id: item.id });

      if (!existingProduct) {
        const newProduct = new Product({
          id: item.id,
          title: item.title,
          price: item.price,
          description: item.description,
          category: item.category,
          image: item.image,
          sold: item.sold || false,
          dateOfSale: item.dateOfSale || new Date()
        });

        await newProduct.save();
        console.log(`Product with id ${item.id} added to the database.`);
      } else {
        console.log(`Product with id ${item.id} already exists.`);
      }
    }

    res.status(200).send('Database initialized with seed data');
  } catch (err) {
    console.error('Error initializing database:', err);
    res.status(500).send('Error initializing database');
  }
});

app.get('/transactions', async (req, res) => {
  const { search = '', month, page = 1, perPage = 10 } = req.query;

  if (month && (month < 1 || month > 12)) {
    return res.status(400).send('Invalid month value. Must be between 1 and 12.');
  }

  const skip = (parseInt(page) - 1) * parseInt(perPage);
  const limit = parseInt(perPage);

  const pipeline = [];

  if (search) {
    const searchNumber = parseFloat(search);
    pipeline.push({
      $match: {
        $or: [
          { title: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          {
            $expr: {
              $and: [
                { $ne: [{ $type: "$price" }, "missing"] },
                {
                  $or: [
                    { $eq: [{ $toString: "$price" }, search] },
                    { $eq: ["$price", searchNumber] },
                    {
                      $and: [
                        { $gte: ["$price", searchNumber - 0.01] },
                        { $lte: ["$price", searchNumber + 0.01] }
                      ]
                    }
                  ]
                }
              ]
            }
          }
        ]
      }
    });
  }

  if (month) {
    pipeline.push({
      $match: {
        $expr: {
          $eq: [{ $month: "$dateOfSale" }, parseInt(month)]
        }
      }
    });
  }

  try {
    const totalRecordsPipeline = [...pipeline];
    totalRecordsPipeline.push({ $count: 'total' });

    const totalResult = await Product.aggregate(totalRecordsPipeline).exec();
    const totalRecords = totalResult.length > 0 ? totalResult[0].total : 0;


    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    const transactions = await Product.aggregate(pipeline).exec();

    res.status(200).json({
      transactions,
      currentPage: parseInt(page),
      perPage: parseInt(perPage),
      totalRecords,
      totalPages: Math.ceil(totalRecords / perPage)
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).send('Server error occurred while fetching transactions');
  }
});



app.get('/statistics', async (req, res) => {
  const { month } = req.query;

  if (!month || month < 1 || month > 12) {
    return res.status(400).send('Invalid month value. Must be between 1 and 12.');
  }

  try {
    const pipeline = [
      {
        $match: {
          $expr: {
            $eq: [{ $month: "$dateOfSale" }, parseInt(month)]
          }
        }
      },
      {
        $group: {
          _id: null,
          totalSaleAmount: {
            $sum: {
              $cond: [{ $eq: ["$sold", true] }, "$price", 0]
            }
          },
          totalSoldItems: {
            $sum: {
              $cond: [{ $eq: ["$sold", true] }, 1, 0]
            }
          },
          totalNotSoldItems: {
            $sum: {
              $cond: [{ $eq: ["$sold", false] }, 1, 0]
            }
          }
        }
      }
    ];

    const result = await Product.aggregate(pipeline).exec();

    const stats = result.length > 0 ? result[0] : {
      totalSaleAmount: 0,
      totalSoldItems: 0,
      totalNotSoldItems: 0
    };

    res.status(200).json({
      month: parseInt(month),
      totalSaleAmount: stats.totalSaleAmount,
      totalSoldItems: stats.totalSoldItems,
      totalNotSoldItems: stats.totalNotSoldItems
    });

  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).send('Server error occurred while fetching statistics');
  }
});

app.get('/bar-chart', async (req, res) => {
  const { month } = req.query;

  if (!month || month < 1 || month > 12) {
    return res.status(400).send('Invalid month value. Must be between 1 and 12.');
  }

  const priceRanges = [
    { min: 0, max: 100 },
    { min: 101, max: 200 },
    { min: 201, max: 300 },
    { min: 301, max: 400 },
    { min: 401, max: 500 },
    { min: 501, max: 600 },
    { min: 601, max: 700 },
    { min: 701, max: 800 },
    { min: 801, max: 900 },
    { min: 901, max: Infinity }
  ];

  const barChartData = priceRanges.map(range => ({ range: `${range.min} - ${range.max === Infinity ? 'Above 901' : range.max}`, count: 0 }));

  try {
    const pipeline = [
      {
        $match: {
          $expr: {
            $eq: [{ $month: "$dateOfSale" }, parseInt(month)]
          }
        }
      },
      {
        $group: {
          _id: null,
          items: { $push: "$$ROOT" }
        }
      }
    ];

    const result = await Product.aggregate(pipeline).exec();

    if (result.length > 0) {
      const items = result[0].items;

      items.forEach(item => {
        const price = item.price;

        priceRanges.forEach((range, index) => {
          if (price >= range.min && price <= range.max) {
            barChartData[index].count++;
          }
        });
      });
    }

    res.status(200).json(barChartData);

  } catch (error) {
    console.error('Error fetching bar chart data:', error);
    res.status(500).send('Server error occurred while fetching bar chart data');
  }
});

app.get('/pie-chart', async (req, res) => {
  const { month } = req.query;

  if (!month || month < 1 || month > 12) {
    return res.status(400).send('Invalid month value. Must be between 1 and 12.');
  }

  try {
    const pipeline = [
      {
        $match: {
          $expr: {
            $eq: [{ $month: "$dateOfSale" }, parseInt(month)]
          }
        }
      },
      {
        $group: {
          _id: "$category",
          itemCount: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          category: "$_id",
          itemCount: 1
        }
      }
    ];

    const result = await Product.aggregate(pipeline).exec();

    const pieChartData = result.map(item => ({
      category: item.category,
      count: item.itemCount
    }));

    res.status(200).json(pieChartData);

  } catch (error) {
    console.error('Error fetching pie chart data:', error);
    res.status(500).send('Server error occurred while fetching pie chart data');
  }
});

app.get('/combined-data', async (req, res) => {
  const { month } = req.query;

  if (!month || month < 1 || month > 12) {
    return res.status(400).send('Invalid month value. Must be between 1 and 12.');
  }

  try {
    const statisticsPipeline = [
      {
        $match: {
          $expr: {
            $eq: [{ $month: "$dateOfSale" }, parseInt(month)]
          }
        }
      },
      {
        $group: {
          _id: null,
          totalSaleAmount: {
            $sum: {
              $cond: [{ $eq: ["$sold", true] }, "$price", 0]
            }
          },
          totalSoldItems: {
            $sum: {
              $cond: [{ $eq: ["$sold", true] }, 1, 0]
            }
          },
          totalNotSoldItems: {
            $sum: {
              $cond: [{ $eq: ["$sold", false] }, 1, 0]
            }
          }
        }
      }
    ];

    const barChartPipeline = [
      {
        $match: {
          $expr: {
            $eq: [{ $month: "$dateOfSale" }, parseInt(month)]
          }
        }
      },
      {
        $group: {
          _id: "$category",
          itemCount: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          category: "$_id",
          itemCount: 1
        }
      }
    ];

    const statsResult = await Product.aggregate(statisticsPipeline).exec();
    const barChartResult = await Product.aggregate(barChartPipeline).exec();

    const combinedData = {
      statistics: statsResult.length > 0 ? statsResult[0] : {
        totalSaleAmount: 0,
        totalSoldItems: 0,
        totalNotSoldItems: 0
      },
      barChartData: barChartResult.map(item => ({
        category: item.category,
        count: item.itemCount
      }))
    };

    res.status(200).json(combinedData);

  } catch (error) {
    console.error('Error fetching combined data:', error);
    res.status(500).send('Server error occurred while fetching combined data');
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
