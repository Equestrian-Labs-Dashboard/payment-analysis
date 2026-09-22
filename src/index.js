const config=require("./config");

const ShopifyClient=require("./shopifyClient");


const corro =
new ShopifyClient(
config.brands.CORRO,
"CORRO"
);


const cavali =
new ShopifyClient(
config.brands.CAVALI,
"CAVALI"
);
