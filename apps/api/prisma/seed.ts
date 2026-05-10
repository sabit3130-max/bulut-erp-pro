const summary = {
  users: ['admin@demo.local', 'muhasebe@demo.local', 'satis@demo.local', 'depo@demo.local', 'bayi@demo.local'],
  accounts: '10 musteri/bayi + 5 tedarikci',
  products: '30 urun, 3 depo',
  transactions: '20 satis, 10 tahsilat, 10 alis, 1 teklif',
};

console.log('Demo seed hazir. In-memory demo API acilista ayni veri setini otomatik yukler.');
console.log(JSON.stringify(summary, null, 2));
