"""Build the independent ControlPublicidad beta APK using official Android tools."""
from pathlib import Path
import os, subprocess, shutil, zipfile, secrets, hashlib
root=Path(__file__).resolve().parent.parent
tools=Path(os.environ.get('CP_ANDROID_TOOLS','/tmp/controlpublicidad-android-tools'))
private=Path(os.environ.get('CP_ANDROID_SIGNING_DIR',str(root.parent/'controlpublicidad-private')))
out=Path(os.environ.get('CP_ANDROID_OUTPUT',str(root.parent/'controlpublicidad-deliverables')))
build=root/'build/android'
platform=tools/'android-36/android.jar';sdk=tools/'android-15'
private.mkdir(parents=True,exist_ok=True,mode=0o700);out.mkdir(parents=True,exist_ok=True)
if build.exists():shutil.rmtree(build)
for p in ['assets','generated','classes','dex']:(build/p).mkdir(parents=True)
shutil.copytree(root/'android/assets',build/'assets',dirs_exist_ok=True)
for name in ['aapt2','zipalign']:(sdk/name).chmod(0o755)
def run(args):subprocess.run([str(x) for x in args],cwd=root,check=True)
run([sdk/'aapt2','compile','--dir',root/'android/res','-o',build/'resources.zip'])
run([sdk/'aapt2','link','-o',build/'base.apk','-I',platform,'--manifest',root/'android/AndroidManifest.xml','--java',build/'generated','-A',build/'assets',build/'resources.zip'])
sources=list((root/'android/src').rglob('*.java'))+list((build/'generated').rglob('*.java'))
run(['java','-jar',tools/'ecj.jar','-1.8','-bootclasspath',str(platform)+os.pathsep+str(sdk/'core-lambda-stubs.jar'),'-classpath',platform,'-d',build/'classes',*sources])
run(['java','-cp',sdk/'lib/d8.jar','com.android.tools.r8.D8','--lib',platform,'--min-api','26','--output',build/'dex',*list((build/'classes').rglob('*.class'))])
with zipfile.ZipFile(build/'base.apk','a',compression=zipfile.ZIP_STORED) as z:
 for p in (build/'dex').glob('*.dex'):z.write(p,p.name)
run([sdk/'zipalign','-f','-p','4',build/'base.apk',build/'aligned.apk'])
password=private/'signing-password.txt';keystore=private/'controlpublicidad.p12'
if keystore.exists() and not password.exists():raise RuntimeError('Provide the existing signing password; never replace an established signing key.')
if not keystore.exists():
 password.write_text(secrets.token_urlsafe(40));password.chmod(0o600)
 run(['keytool','-genkeypair','-alias','controlpublicidad','-keyalg','RSA','-keysize','3072','-validity','10000','-keystore',keystore,'-storetype','PKCS12','-storepass:file',password,'-keypass:file',password,'-dname','CN=ControlPublicidad, OU=Android Beta, O=ControlPublicidad, L=Morelia, ST=Michoacan, C=MX'])
 keystore.chmod(0o600)
apk=out/'ControlPublicidad_Android_0.1.1_beta.apk'
run(['java','-jar',sdk/'lib/apksigner.jar','sign','--ks',keystore,'--ks-key-alias','controlpublicidad','--ks-pass','file:'+str(password),'--out',apk,build/'aligned.apk'])
run(['java','-jar',sdk/'lib/apksigner.jar','verify','--verbose','--print-certs',apk])
run([sdk/'zipalign','-c','-p','4',apk])
print(apk);print('SHA-256:',hashlib.sha256(apk.read_bytes()).hexdigest())
