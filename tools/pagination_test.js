const { paginate } = require('../server/helpers/pagination');

const cases = [
  {page:1, limit:10, name:'page=1,limit=10'},
  {page:0, limit:10, name:'page=0'},
  {page:-5, limit:10, name:'page=-5'},
  {page:'abc', limit:10, name:'page=abc'},
  {page:1, limit:0, name:'limit=0'},
  {page:1, limit:500, name:'limit=500'},
  {page:9999, limit:10, name:'page=big'}
];

const totals = [95, 0, 5];

for (const total of totals) {
  console.log('\n=== total=' + total + ' ===');
  for (const c of cases) {
    const {limit, offset, page, response} = paginate({}, c.page, c.limit);
    const meta = response([], total);
    console.log(`${c.name}: page=${page}, limit=${limit}, offset=${offset}, totalPages=${meta.totalPages}, hasNext=${meta.hasNext}, hasPrev=${meta.hasPrev}`);
  }
}
