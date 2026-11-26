// Applique l'icône et les informations de version DREAD ROYAL à l'exécutable Windows (sans wine).
const fs = require('fs');
const ResEdit = require('resedit');
const [exePath, icoPath, version] = process.argv.slice(2);
const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
const res = ResEdit.NtExecutableResource.from(exe);
const ico = ResEdit.Data.IconFile.from(fs.readFileSync(icoPath));
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
const ids = groups.length ? groups.map((g) => [g.id, g.lang]) : [[1, 1033]];
for (const [id, lang] of ids) {
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, id, lang, ico.icons.map((i) => i.data));
}
const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0] || ResEdit.Resource.VersionInfo.createEmpty();
const [a, b, c] = version.split('.').map(Number);
vi.setFileVersion(a, b, c, 0, 1033);
vi.setProductVersion(a, b, c, 0, 1033);
vi.setStringValues({ lang: 1033, codepage: 1200 }, {
  ProductName: 'DREAD ROYAL', FileDescription: 'DREAD ROYAL Management System', CompanyName: 'DREAD ROYAL',
  LegalCopyright: 'DREAD ROYAL - Votre couronne, votre identité.', OriginalFilename: 'DREAD ROYAL.exe', InternalName: 'DREAD ROYAL',
});
vi.outputToResourceEntries(res.entries);
res.outputResource(exe);
fs.writeFileSync(exePath, Buffer.from(exe.generate()));
console.log('Icône et version appliquées :', exePath);
