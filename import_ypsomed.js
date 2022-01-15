const fs = require('fs');
const path = require('path');
const csv = require('fast-csv');
const moment = require('moment');
const axios = require('axios');


const lastRun = moment('2022-01-15T07:45:00+01:00');
const beginningTime = moment('2021-12-22T19:45:00+01:00');

function formatToSugarmateAndGroup(row, feedItems) {
  var ts = moment(row.Datum + ' ' + row.Uhrzeit, "DD.MM.YY HH:mm", true);

  var value = parseFloat(row.Wert.replace(',', '.'));

  var roundBy = 1000 * 60 * 15; // 15 minutes
  var tsRound = moment(Math.round(ts.valueOf() / roundBy) * roundBy);

  if (value == 0) {
    return;
  }

  var event_type = null;
  switch (row.Ereignis) {
    case 'Kohlenhydrate':
      event_type = 'food';
      break

    case 'Kombinierter Bolus':
    case 'Verzögerter Bolus':
    case 'Bolus':
      event_type = 'insulin';
      break
  }

  if (event_type) {
    if (!feedItems[tsRound.format()]) {
      feedItems[tsRound.format()] = {};
    }

    feedItems[tsRound.format()][event_type] = {
      timestamp: ts,
      value,
      info: (row.Information + row.Notiz).replaceAll(" U", "\n").trim()
    }
  }
}

async function transfertToSugarmate(feedItems) {
  var feedApi = axios.create({
    baseURL: 'https://sugarmate.io/api/v1/',
    timeout: 30_000,
    headers: {
      'Cookie': 'remember_token=7680bd26a0c8fcfbc8eaf8cf3c68451bbcb895ba; feed-open=on; lastAccountInsulinId=51138; _sugar_time_session=QjFDZlRJS05obDdKUGlzRGs5N1VuUTlTclIzV2ZZVTc3Yjl1SlhGQmZkVGErbmxtbjVSdzhGa3FKR2JTT1h0WTlRYVk0aXpuMTd2WStTS3RGSHA3Y2RKUlhUM212M2lOYk9ueDdzdEJjeHJ6NUNVTWxKblB5elYzaWRuOWR2b2tiSFloZUJKZllqZlBodVJERXNjaHVVZCtwOUFoaEZxMFZUdWRvY2x5OGJwK1gxWGF6K1dxNFYxTnR2TURuYXBBejhPTEk3L0FsQ1VDODV2c25GRVlxL0JOK0pSSmhBRXNjTE5pdkdIZUc5MDJIVy93eFhub0RrUDBzbGZkSlRvRi0tMXVjaWdOMG1mSGhZNmoxTGlic3ZyQT09--e2c853e331416791b29bdf38de11c79502a77554',
    }
  });

  var temp_id = -100;
  var httPosts = 0;

  for (const [groupTts, fItems] of Object.entries(feedItems)) {
    var feed_item_cells = [];
    var sort_order = 0;

    var ts;
    for (const [type, fInfo] of Object.entries(fItems)) {
      var feed_item_additional = {};
      switch (type) {
        case 'insulin':
          feed_item_additional = {
            feedable_id: 51138,
            feedable_type: 'AccountInsulin',
          };
          break;
      }

      ts = fInfo.timestamp;

      feed_item_cells[feed_item_cells.length] = {
        temp_id: temp_id--,
        sort_order: sort_order++,
        event_type: type,
        amount: fInfo.value,
        notes: fInfo.info,
        ...feed_item_additional
      };
    }


    if (beginningTime.isBefore(ts)) {
      continue;
    }

    console.log(ts);

    var response = await feedApi.post(
      'feed_item',
      {
        feed_item: {
          time: ts.format(),
          feed_item_cells,
          temp_id: temp_id--
        },
        delete: false
      }
    );

    console.log(response.data);

    httPosts++;
  }
}

var feedItems = {};
fs.createReadStream(path.resolve(__dirname, 'assets', './Tagebuch.csv'))
  .pipe(csv.parse({ headers: true, delimiter: ';' }))
  .on('error', error => console.error(error))
  .on('data', row => formatToSugarmateAndGroup(row, feedItems))
  .on('end', rowCount => {
    transfertToSugarmate(feedItems);
    console.log(`Parsed ${rowCount} rows`);
  });