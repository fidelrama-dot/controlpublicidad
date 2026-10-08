"""Run portable encryption, durability, immutable records, hierarchy and upload tests."""
from pathlib import Path
import os,subprocess,urllib.request,hashlib,shutil
root=Path(__file__).resolve().parent.parent;tools=Path(os.environ.get('CP_ANDROID_TOOLS','/tmp/controlpublicidad-android-tools'));tools.mkdir(parents=True,exist_ok=True)
jar=tools/'json-test.jar'
url='https://repo.maven.apache.org/maven2/org/json/json/20240303/json-20240303.jar'
if not jar.exists():
 with urllib.request.urlopen(url,timeout=45) as r:data=r.read()
 with urllib.request.urlopen(url+'.sha1',timeout=45) as r:checksum=r.read().decode().strip()
 assert hashlib.sha1(data).hexdigest()==checksum;jar.write_bytes(data)
classes=root/'build/android-tests';classes.mkdir(parents=True,exist_ok=True)
sources=[root/'android/src/com/controlpublicidad/app'/name for name in ['CryptoFiles.java','RecordStore.java','Policy.java','ApiClient.java']]+[root/'android/tests/CoreTest.java']
compiler=['javac','--release','8'] if shutil.which('javac') else ['java','-jar',str(tools/'ecj.jar'),'-1.8']
subprocess.run([*compiler,'-encoding','UTF-8','-cp',str(jar),'-d',str(classes),*map(str,sources)],check=True)
subprocess.run(['java','-cp',str(classes)+os.pathsep+str(jar),'com.controlpublicidad.app.CoreTest'],check=True)
