package main
import("context";"fmt";"net/http";"net/http/httptest";"net/url";"testing")
func TestOwnerAccess(t *testing.T){
 for _,tc:=range []struct{name,owner,user string; fail bool; code int}{
  {"owner","42","42",false,204},{"other tailnet user","42","43",false,403},{"missing identity","42","",true,403},{"unbound owner","","",false,403},
 }{t.Run(tc.name,func(t *testing.T){h:=ownerOnly(tc.owner,func(context.Context,string)(string,error){if tc.fail{return "",fmt.Errorf("unknown")};return tc.user,nil},http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){w.WriteHeader(204)}));w:=httptest.NewRecorder();h.ServeHTTP(w,httptest.NewRequest("GET","https://retrace-phone.example.ts.net/",nil));if w.Code!=tc.code{t.Fatalf("%d",w.Code)}})}
}
func TestProxyRejectsHostAndReplacesSecret(t *testing.T){
 received:="";up:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){received=r.Header.Get("X-Retrace-Bridge");if r.Header.Get("X-Forwarded-Host")!=""{t.Error("untrusted forwarded host")};w.WriteHeader(204)}));defer up.Close();target,_:=url.Parse(up.URL);h:=proxyFor(target,"actual-secret","retrace-phone.example.ts.net")
 for _,host:=range []string{"attacker.example","retrace-phone.example.ts.net"}{r:=httptest.NewRequest("GET","https://"+host+"/api/state",nil);r.Header.Set("X-Retrace-Bridge","attacker");r.Header.Set("X-Forwarded-Host","attacker");w:=httptest.NewRecorder();h.ServeHTTP(w,r);if host=="attacker.example"&&w.Code!=403{t.Fatal("host bypass")};if host!="attacker.example"&&(w.Code!=204||received!="actual-secret"){t.Fatal("proxy secret")}}
}
