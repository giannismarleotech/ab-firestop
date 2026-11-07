import { scryptSync,randomBytes } from 'node:crypto';
if(!process.stdin.isTTY){console.error('Open dit commando in een interactieve terminal.');process.exit(1);}
console.log('Kies het beheerderswachtwoord (minstens 12 tekens). Invoer blijft verborgen.');
process.stdin.setRawMode(true);process.stdin.resume();let input='';
process.stdin.on('data',chunk=>{
  for(const ch of chunk.toString()){
    if(ch==='\u0003'){process.stdin.setRawMode(false);process.exit(1);}
    if(ch==='\r'||ch==='\n'){
      process.stdin.setRawMode(false);process.stdin.pause();
      if(input.length<12){console.error('Wachtwoord te kort.');process.exit(1);}
      const salt=randomBytes(16).toString('hex');
      console.log('\nVul deze waarden in Netlify in, alleen voor de Functions-scope:');
      console.log('AB_ADMIN_EMAIL=info@abfirestop.be');
      console.log('AB_ADMIN_PASSWORD_HASH='+salt+':'+scryptSync(input,salt,64).toString('hex'));
      console.log('AB_SESSION_SECRET='+randomBytes(32).toString('hex'));process.exit(0);
    }
    if(ch==='\u007f')input=input.slice(0,-1);else if(ch>=' ')input+=ch;
  }
});
