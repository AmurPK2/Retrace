package main

import (
 "context"
 "encoding/json"
 "flag"
 "fmt"
 "io"
 "net/http"
 "net/http/httputil"
 "net/url"
 "os"
 "path/filepath"
 "regexp"
 "strings"
 "time"
 "tailscale.com/tsnet"
)

type config struct { Upstream string `json:"upstream"`; Secret string `json:"secret"` }
var loginPattern = regexp.MustCompile(`https://login\.tailscale\.com/a/[A-Za-z0-9]+`)

// Authentication is applied to every resource, including static assets and APIs.
func ownerOnly(owner string, identify func(context.Context,string)(string,error), next http.Handler) http.Handler {
 return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
  user, err := identify(r.Context(),r.RemoteAddr)
  if err != nil || owner == "" || user != owner { w.Header().Set("Cache-Control","no-store"); http.Error(w,"Private owner access required.",http.StatusForbidden); return }
  next.ServeHTTP(w,r)
 })
}
func proxyFor(target *url.URL, secret, host string) http.Handler {
 proxy := &httputil.ReverseProxy{Rewrite:func(pr *httputil.ProxyRequest) {
  pr.SetURL(target); pr.Out.Host=host
  pr.Out.Header.Del("X-Forwarded-For"); pr.Out.Header.Del("X-Forwarded-Host"); pr.Out.Header.Del("X-Forwarded-Proto")
  pr.Out.Header.Set("X-Retrace-Bridge",secret)
 }, ErrorHandler:func(w http.ResponseWriter,r *http.Request,e error) { http.Error(w,"Open RETRACE on your PC to reconnect.",http.StatusServiceUnavailable) }}
 return http.HandlerFunc(func(w http.ResponseWriter,r *http.Request) {
  if r.Host != host { http.Error(w,"Invalid host.",http.StatusForbidden); return }
  w.Header().Set("Strict-Transport-Security","max-age=31536000")
  proxy.ServeHTTP(w,r)
 })
}
func run() error {
 state := flag.String("state","","private state directory"); _ = flag.Int("parent",0,"owning RETRACE process")
 flag.Parse(); if *state=="" { return fmt.Errorf("missing private state directory") }
 ctx,cancel := context.WithCancel(context.Background()); defer cancel()
 // Parent crash or graceful shutdown closes the inherited pipe. No service/autostart.
 go func(){ _,_ = io.Copy(io.Discard,os.Stdin); cancel() }()
 raw,err := os.ReadFile(filepath.Join(*state,"bridge.json")); if err!=nil{return err}
 var cfg config; if err=json.Unmarshal(raw,&cfg);err!=nil{return err}
 target,err := url.Parse(cfg.Upstream)
 if err!=nil || target.Scheme!="http" || target.Hostname()!="127.0.0.1" || len(cfg.Secret)!=64 {return fmt.Errorf("invalid bridge")}
 for _,k := range []string{"TS_AUTHKEY","TS_CLIENT_ID","TS_CLIENT_SECRET","TS_ID_TOKEN","TS_AUDIENCE","TS_CONTROL_URL"} { os.Unsetenv(k) }
 s := &tsnet.Server{Dir:filepath.Join(*state,"tailnet"),Hostname:"retrace-phone",Ephemeral:false,
  Logf:func(string,...any){}, UserLogf:func(format string,args ...any){ if login:=loginPattern.FindString(fmt.Sprintf(format,args...));login!=""{_ = os.WriteFile(filepath.Join(*state,"login-url.txt"),[]byte(login),0600)} }}
 defer s.Close()
 st,err := s.Up(ctx);if err!=nil{return err};if st.Self==nil{return fmt.Errorf("missing private identity")}
 host := strings.TrimSuffix(st.Self.DNSName,"."); if host=="" || !strings.HasSuffix(host,".ts.net"){return fmt.Errorf("HTTPS DNS is not available")}
 lc,err := s.LocalClient();if err!=nil{return err}
 owner := fmt.Sprint(st.Self.UserID)
 identify:=func(ctx context.Context,remote string)(string,error){who,err:=lc.WhoIs(ctx,remote);if err!=nil{return "",err};if who.UserProfile==nil{return "",fmt.Errorf("missing user")};return fmt.Sprint(who.UserProfile.ID),nil}
 listener,err := s.ListenTLS("tcp",":443");if err!=nil{return err}
 defer listener.Close()
 server:=&http.Server{Handler:ownerOnly(owner,identify,proxyFor(target,cfg.Secret,host)),ReadHeaderTimeout:15*time.Second,IdleTimeout:60*time.Second,MaxHeaderBytes:32*1024}
 status,_:=json.Marshal(map[string]any{"url":"https://"+host,"ready":true})
 if err=os.WriteFile(filepath.Join(*state,"status.json"),status,0600);err!=nil{return err}
 go func(){<-ctx.Done();shutdown,done:=context.WithTimeout(context.Background(),5*time.Second);defer done();_ = server.Shutdown(shutdown)}()
 err=server.Serve(listener);if err==http.ErrServerClosed{return nil};return err
}
func main(){if err:=run();err!=nil{os.Exit(1)}}
