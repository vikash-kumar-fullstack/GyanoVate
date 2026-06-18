import sys
try:
    import face_recognition
    print('face_recognition imported, version:', getattr(face_recognition, '__version__', 'n/a'))
except Exception as e:
    print('face_recognition import error:', e)

try:
    import face_recognition_models
    import inspect
    print('face_recognition_models imported, file:', inspect.getsourcefile(face_recognition_models))
except Exception as e:
    print('face_recognition_models import error:', e)

try:
    import dlib
    print('dlib imported, version:', dlib.__version__)
except Exception as e:
    print('dlib import error:', e)

print('sys.path:')
for p in sys.path[:10]:
    print(' -', p)
