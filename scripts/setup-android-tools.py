"""Fetch official Android SDK archives and ECJ, verifying their published checksums."""
from pathlib import Path
import urllib.request, xml.etree.ElementTree as ET, hashlib, zipfile, io, os
root=Path(os.environ.get('CP_ANDROID_TOOLS','/tmp/controlpublicidad-android-tools'))
root.mkdir(parents=True,exist_ok=True)
base='https://dl.google.com/android/repository/'
def fetch(url):
    with urllib.request.urlopen(url,timeout=45) as response:return response.read()
def tag(node):return node.tag.rsplit('}',1)[-1]
def child(node,name):return next(n for n in node if tag(n)==name)
repo=ET.fromstring(fetch(base+'repository2-1.xml'))
for package_path in ['platforms;android-36','build-tools;35.0.0']:
    package=next(n for n in repo if n.attrib.get('path')==package_path)
    archives=child(package,'archives')
    archive=next(n for n in archives if not any(tag(c)=='host-os' for c in n) or child(n,'host-os').text=='linux')
    complete=child(archive,'complete');url=child(complete,'url').text;checksum=child(complete,'checksum')
    data=fetch(base+url)
    assert hashlib.new(checksum.attrib.get('type','sha1'),data).hexdigest()==checksum.text.strip()
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        assert all('..' not in Path(n).parts and not n.startswith('/') for n in z.namelist())
        z.extractall(root)
        if package_path=='platforms;android-36':
            extracted=root/z.namelist()[0].split('/')[0]
            canonical=root/'android-36'
            if extracted!=canonical and not canonical.exists():extracted.rename(canonical)
    print(package_path,'checksum verified',len(data),'bytes')
ecj='https://repo.maven.apache.org/maven2/org/eclipse/jdt/ecj/3.46.100/ecj-3.46.100.jar'
data=fetch(ecj);assert hashlib.sha1(data).hexdigest()==fetch(ecj+'.sha1').decode().strip()
(root/'ecj.jar').write_bytes(data)
assert (root/'android-36/android.jar').is_file()
assert (root/'android-15/lib/apksigner.jar').is_file()
print('ECJ checksum verified. Android tools ready.')
