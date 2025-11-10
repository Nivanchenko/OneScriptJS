import express from 'express';
import { join } from 'node:path';

const app = express();
const port = 3000;

app.use(express.static('public'))

app.get('/', (req, res) => {
  const filePath = join(process.cwd(), 'playground/index.html');
  res.sendFile(filePath);
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});