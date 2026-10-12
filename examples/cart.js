import {tax} from './tax'
import {round} from './math'

// Sum of line items plus tax.
function total(items,rate){
  let sum=0
  for(const i of items){sum+=i.price*i.qty}
  return round(sum+tax(sum,rate))
}

function discount(sum,code){
  if(code=='VIP'){return sum*0.9}
  return sum
}

module.exports={total,discount}
