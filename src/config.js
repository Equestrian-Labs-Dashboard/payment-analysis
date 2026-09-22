const normalizeStore = (store) => {
  return String(store || "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
};


module.exports = {

  apiVersion: "2025-10",

  brands: {

    CORRO: {
      store:
        normalizeStore("equestrian-labs.myshopify.com"),
      token:
        process.env.SHOPIFY_CORRO_TOKEN
    },


    CAVALI: {
      store:
        normalizeStore("cavali-club.myshopify.com"),
      token:
        process.env.SHOPIFY_CAVALI_TOKEN
    }

  }

};
