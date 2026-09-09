// Synthetic ROOT fixture, not a simulated physics sample.
#include "scan_showermax.C"

void test_showermax_scan(const char* directory,const char* response_path) {
  std::string base(directory),root=base+"/fixture.root",plan=base+"/plan.tsv",out=base+"/moments.tsv";
  {
    std::ofstream p(plan);
    p<<"ip\tit\tpl\tph\ttl\tth\tgroup\tprobability\tquota\n0\t0\t0\t20000\t0\t1000\t0\t1\t6\n";
  }
  {
    TFile f(root.c_str(),"RECREATE");TTree t("T","synthetic moment fixture");
    remollEvent_t event{};double rate=0;
    std::vector<remollEventParticle_t> parts(1);
    parts[0].pid=11;parts[0].p=1000;parts[0].pz=1000;
    std::vector<remollGenericDetectorHit_t> hits;
    t.Branch("ev",&event);t.Branch("rate",&rate);t.Branch("part",&parts);t.Branch("hit",&hits);
    for(int i=0;i<6;++i) {
      double w[]={1.2,2.,3.};event.W2=std::pow(w[i%3]*1000,2);
      rate=i==5?0:i+1;hits.clear();
      for(int det:{73003,73001,73002}) {
        remollGenericDetectorHit_t h{};h.det=det;h.pid=11;h.e=1000;h.x=1100;h.pz=1;
        hits.push_back(h);hits.push_back(h); // same-history cross terms matter
        h.pz=-1;hits.push_back(h); // backward crossings must not contribute
      }
      t.Fill();
    }
    t.Write();
  }
  scan_showermax(root.c_str(),plan.c_str(),response_path,out.c_str(),"ep_inelastic",6);
  std::ifstream input(out);std::string line;std::getline(input,line);
  int r,c,checked=0;double s,v,ct;
  while(input>>r>>c>>s>>v>>ct) {
    if(r==3)continue;
    int det[]={73003,73001,73002};double u=response(det[r],11,1000,1100,0);
    if(u<=0)throw std::runtime_error("Fixture response is zero");
    double sums[]={10,14,6},squares[]={68,116,36};
    double es=sums[c]*u,ev=1.2*(squares[c]-sums[c]*sums[c]/6)*u*u;
    double ec=1.2*(squares[c]-sums[c]*30/6)*u*u;
    auto same=[](double a,double b){return std::abs(a-b)<1e-10*std::max(1.,std::abs(b));};
    if(!same(s,es)||!same(v,ev)||!same(ct,ec))throw std::runtime_error("Synthetic fixed-quota moment mismatch");
    ++checked;
  }
  if(checked!=9)throw std::runtime_error("Missing regional component moments");
  std::cout<<"SHOWERMAX_FIXTURE_OK"<<std::endl;
}
