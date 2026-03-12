const bcrypt = require('bcryptjs');
async function run() {
    const hash = '$2b$10$IEEZlB/TAk3QSWSBR/Mdce7qPROpnNPsavAAFN9KQZ5jL4tukRrkYa';
    console.log("8921135339 :", await bcrypt.compare('8921135339', hash));
    console.log("8921135339@Sarga :", await bcrypt.compare('8921135339@Sarga', hash));

    // Check what the hash of 8921135339 actually looks like
    const newHash = await bcrypt.hash('8921135339', 10);
    console.log("new hash: ", newHash);
}
run();
