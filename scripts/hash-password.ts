/* Usage: npm run hash-password -- "my long passphrase"  → prints the OWNER_PASSWORD_HASH value */
import { hashPassword } from "../src/lib/server/crypto";

const pw = process.argv[2];
if (!pw || pw.length < 12) {
  console.error("Použij heslo/passphrase o délce alespoň 12 znaků.");
  process.exit(1);
}
hashPassword(pw).then((h) => console.log(h));
