const fs=require("fs");const path=require("path");const {spawnSync}=require("child_process");
const root=path.join(__dirname,"..");const www=path.join(root,"www");
fs.mkdirSync(www,{recursive:true});
["index.html","style.css","app.js","manifest.json","sw.js","icon-192.png","icon-512.png","icon.svg","apple-touch-icon.png","CONNECT.md"].forEach(f=>{
  const s=path.join(root,f); if(fs.existsSync(s)) fs.copyFileSync(s,path.join(www,f));
});
function copyDir(n){const s=path.join(root,n),d=path.join(www,n);if(!fs.existsSync(s))return;fs.rmSync(d,{recursive:true,force:true});fs.cpSync(s,d,{recursive:true});}
copyDir("data");copyDir("icons");
const inj=spawnSync(process.execPath,[path.join(__dirname,"inject-native-config.js")],{stdio:"inherit"});
if(inj.status) process.exit(inj.status||1);
console.log("www synced (+ native-config)");
