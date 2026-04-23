const jwt=require("jsonwebtoken");
const token=jwt.sign({id:1,role:"Admin",branch_name:"Perambra"}, "GJiK3wgAigY4Bg4WZgH6QAgla53rVS0Aftd4ihqwATiOKiAyzB7Nzhm1rilzehme", {expiresIn:"7d"});
console.log(token);
