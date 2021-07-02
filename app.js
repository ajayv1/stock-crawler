const cheerio = require('cheerio');
const dayjs = require('dayjs');
const axios = require('axios');
const _ = require('lodash');
const express = require('express');
const cors = require('cors')

const app = express();

// const corsOptions = {
//   origin: 'http://127.0.0.1:5500',
//   optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
// };

const whitelist = ['http://127.0.0.1:5500', 'https://babathebest.com'];

const corsOptionsDelegate = (req, callback) => {
  let corsOptions;

  let isDomainAllowed = whitelist.indexOf(req.header('Origin')) !== -1;

  if (isDomainAllowed) {
      // Enable CORS for this request
      corsOptions = { origin: true }
  } else {
      // Disable CORS for this request
      corsOptions = { origin: false }
  }
  callback(null, corsOptions)
};

async function getPartialData(ticker, prevDate, curDate) {
  let url = `https://in.finance.yahoo.com/quote/${ticker}/history?period1=${prevDate}&period2=${curDate}&interval=1d`;

  // console.log(url);
  let row = new Map();
  let response;
  try {
    response = await axios.get(url);
    let $ = cheerio.load(response.data);
      
    $('.BdT').each(function(index, data) {
      var children = $(this).children();

      var date = $(children[0]).text().trim();
      var close = $(children[4]).text();

      if (date.indexOf('*Close price adjusted') === -1 && close !== '-') {
        row[date] = row[date] || {
          close: close
        };
      }
    });
    return row;
  } catch (err) {
    console.log(error);
  }
}

async function getStockData(ticker) {
  // Stock gives data in 100 days form -
  // divide year in 3 half of 4 months each
  // 1. to get first half from today back to 4months
  const cur = dayjs(new Date()).unix(); 
  const firstHalf = dayjs(new Date()).subtract(4, 'month');
  // 2. to get second half from 4months back
  const secondHalf = dayjs(firstHalf).subtract(4, 'month');
  // 3. to get third half from 8months back
  const thirdHalf = dayjs(secondHalf).subtract(4, 'month');
  
  const [ valueA, valueB, valueC ] = await Promise.all([ 
    getPartialData(ticker, firstHalf.unix(), cur), 
    getPartialData(ticker, secondHalf.unix(), firstHalf.unix()), 
    getPartialData(ticker, thirdHalf.unix(), secondHalf.unix()) 
  ]);

  let final = {};

  _.extend(final, valueA, valueB, valueC);

  console.log('..................final extended object..............')

  let result = Object.entries(final);

  let counter = 0;
  var sum = 0;
  var resLen = result.length;

  for(var i = resLen - 1; i >= 0; i--) {
    var obj = final[result[i][0]];
    var parseClosedPrice = parseFloat(obj.close.replace(/,/g, ''));
    var temp;
    if (counter >= 200) {
      if (i + 200 === resLen - 1) {
        sum = sum;
        
      } else if (resLen - 1 > (i+200)) {
        sum = sum + 
          parseFloat(final[result[i+1][0]].close.replace(/,/g, '')) - 
          parseFloat(final[result[i+200+1][0]].close.replace(/,/g, ''));
      }

      temp = sum / 200;

      obj['200DMA'] = temp.toFixed(2);
      obj['Change'] = (parseClosedPrice - obj['200DMA']).toFixed(2);
      obj['Variation'] = ((obj['Change'] / parseClosedPrice) * 100).toFixed(2) ;
    } else {
      obj['200DMA'] = '';
      obj['Change'] = '';
      obj['Variation'] = '';
      sum = sum + parseClosedPrice;
    }
    counter++;
  }
  return final;
}

app.get('/', function (req, res) {
  res.json({hi: 'send ticker'});
});

function removeRedundantData (stockData) {
  var data = {};

  for (var key in stockData) {
    if (!stockData.hasOwnProperty(key)) continue;
    var obj = stockData[key];
    
    if (!obj['200DMA']) continue;

    data[key] = obj;
  }
}

app.get('/stockData/:ticker', cors(corsOptionsDelegate), async function (req, res) {
  var ticker = req.params.ticker;
  var isReduce = req.query.reduce;
  const data = await getStockData(ticker);
  const finalData = data;

  if (isReduce) {
    finalData = removeRedundantData(data);
  } 
  
  var response = {
    ticker: ticker,
    data: data
  };

  res.status(200).json(response);
})

const PORT = process.env.PORT || 3000;

app.listen(PORT, function(err) {
  if (err) console.log(err);
  console.log("Server listening on PORT", PORT);
}); 
