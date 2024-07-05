const fetch = require("node-fetch");
const { parse, format } = require("date-fns");

const getDashboardStocksData = async (req, res) => {
  const db = req.app.locals.db;

  const dashboard = await db
    .collection("dashboards")
    .findOne({ email: req.email });
  if (!dashboard || dashboard.dash.length === 0) {
    return res.status(404).json({ error: "No dashboard found" });
  }
  try {
    const options = {
      method: "GET",
      headers: {
        "X-RapidAPI-Key": "cc7b9ca99cmshe131384e2014737p1761d9jsn5f05d5cdf24a",
        "X-RapidAPI-Host": "twelve-data1.p.rapidapi.com",
      },
    };

    const stockDataPromises = dashboard.dash.map((obj) => {
      let url;
      if (obj.type === "widget") {
        url = `https://twelve-data1.p.rapidapi.com/quote?symbol=${obj.symbol}&interval=1day&outputsize=30&format=json`;
      } else if (obj.type === "graph") {
        url = `https://twelve-data1.p.rapidapi.com/time_series?symbol=${obj.symbol}&interval=1h&outputsize=40&format=json`;
      }

      return fetch(url, options).then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch data for ${obj.symbol}`);
        }
        return response.json();
      });
    });

    const stockDataArray = await Promise.all(stockDataPromises);

    const aggregatedData = dashboard.dash.map((obj, index) => {
      const stockData = stockDataArray[index];

      if (obj.type === "widget") {
        return {
          symbol: stockData.symbol,
          name: stockData.name,
          close: stockData.close,
          change: stockData.change,
          percent_change: stockData.percent_change,
          type: obj.type,
        };
      } else if (obj.type === "graph") {
        return {
          symbol: stockData.meta.symbol,
          interval: stockData.meta.interval,
          data: stockData.values.reverse().map((obj) => {
            return {
              close: parseFloat(obj.close).toFixed(2),
              datetime: format(
                parse(obj.datetime, "yyyy-MM-dd HH:mm:ss", new Date()),
                "MMMM d, h:mm a"
              ),
            };
          }),
          type: obj.type,
        };
      }
    });

    return res.status(200).json(aggregatedData);
  } catch (error) {
    console.error("Error fetching stock data:", error);
    return res.status(500).json({ error: "Failed to fetch stock data" });
  }
};

const addDashboardStock = async (req, res) => {
  const { ticker, type } = req.body;
  const db = req.app.locals.db;

  // Define the criteria to check if the object exists in the array
  const filter = {
    email: req.email,
    dash: { $elemMatch: { symbol: ticker } },
  };
  const userDash = await db.collection("dashboards").findOne(filter);

  if (userDash) {
    return res.status(409).json({ error: "Stock already in dashboard" });
  }

  const dash = await db.collection("dashboards").findOne({ email: req.email });

  if (dash) {
    if (dash.dash.length >= 8) {
      return res
        .status(507)
        .json({ error: "Limit of 8 stocks in dashboard reached" });
    }
    const update = {
      $push: { dash: { symbol: ticker, type } },
    };
    await db.collection("dashboards").updateOne({ email: req.email }, update);
    return res.status(200).json({ mssg: "Stock added" });
  } else {
    const doc = {
      email: req.email,
      dash: [{ symbol: ticker, type }],
    };
    await db.collection("dashboards").insertOne(doc);
    res.status(200).json({ mssg: "Stock added" });
  }
};

const deleteDashboardStock = async (req, res) => {
  const { ticker } = req.body;
  const db = req.app.locals.db;
  try {
    await db
      .collection("dashboards")
      .updateOne({ email: req.email }, { $pull: { dash: { symbol: ticker } } });
    return res.status(200).json({ mssg: "Stock deleted" });
  } catch (error) {
    console.log("Error deleting stock" + error);
    res.status(500).json({ error: "Error deleting stock" });
  }
};

module.exports = {
  getDashboardStocksData,
  addDashboardStock,
  deleteDashboardStock,
};
