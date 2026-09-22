class ShopifyClient {

constructor(config, brand){

this.brand = brand;
this.store = config.store;
this.token = config.token;

this.baseUrl =
`https://${this.store}/admin/api/2025-10`;

console.log(
`[${brand}] Shopify store: ${this.store}`
);

console.log(
`[${brand}] Endpoint: ${this.baseUrl}`
);

}


async get(endpoint){

const response =
await fetch(
`${this.baseUrl}/${endpoint}`,
{
headers:{
"X-Shopify-Access-Token": this.token,
"Content-Type":"application/json"
}
});


const text =
await response.text();


if(!response.ok){

throw new Error(
`[${this.brand}] Shopify ${response.status}: ${text}`
);

}


return JSON.parse(text);

}


}


module.exports = ShopifyClient;
