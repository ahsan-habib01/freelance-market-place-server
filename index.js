const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gz7uf4p.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const db = client.db('freelify-db');
    const jobsCollection = db.collection('jobs');

    app.get('/', (req, res) => {
      res.send('Freelify Server is Running Smoothly...');
    });

    // ✅ Get All Jobs
    app.get('/jobs', async (req, res) => {
      const result = await jobsCollection.find().toArray();
      res.send(result);
    });

    // ✅ Get Single Job by ID
    app.get('/jobs/:id', async (req, res) => {
      const id = req.params.id;
      const objectId = new ObjectId(id);
      const result = await jobsCollection.findOne({ _id: objectId });
      res.send(result);
    });

    // ✅ Add Job
    app.post('/jobs', async (req, res) => {
      const job = req.body;
      job.postedAt = new Date(); // Auto add date/time
      const result = await jobsCollection.insertOne(job);
      res.send(result);
    });

    // ✅ Latest 6 Job
    app.get('/latest-jobs', async (req, res) => {
      const result = await jobsCollection
        .find()
        .sort({ postedAt: -1 })
        .limit(6)
        .toArray();

      res.send(result);
    });

    await client.db('admin').command({ ping: 1 });
    console.log(
      '✅ Pinged your deployment. You successfully connected to MongoDB!'
    );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`🚀 Freelify Server running on port ${port}`);
});
