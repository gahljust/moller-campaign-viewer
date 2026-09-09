// Regional PE moments only; no fit or cross-region covariance matrix.
// Reuse the production response lookup and fixed-quota plan contract.
#include "../acceptance_strata/analyze_neyman_batch.C"

void scan_showermax(const char* root_path, const char* plan_path,
                   const char* response_path, const char* output_path,
                   const char* channel, long long expected_entries) {
  if (!load_fits(response_path)) throw std::runtime_error("Missing PE lookup");
  neyman_batch::Plan plan;
  if (!plan.load(plan_path)) throw std::runtime_error("Invalid allocation plan");
  TFile file(root_path,"READ");
  auto* tree=dynamic_cast<TTree*>(file.Get("T"));
  if (!tree) throw std::runtime_error("Missing ROOT tree");
  const auto entries=tree->GetEntries();
  const bool compact=entries==plan.transports();
  if (!compact && entries!=expected_entries) throw std::runtime_error("History count mismatch");
  tree->SetBranchStatus("*",0);
  // remoll splits ev without a prefix: W2 must be enabled explicitly.
  for (const char* key:{"rate","ev*","W2","part*","hit*"}) tree->SetBranchStatus(key,1);
  double rate=0;
  remollEvent_t* event=nullptr;
  std::vector<remollEventParticle_t>* parts=nullptr;
  std::vector<remollGenericDetectorHit_t>* hits=nullptr;
  tree->SetBranchAddress("rate",&rate);tree->SetBranchAddress("ev",&event);
  tree->SetBranchAddress("part",&parts);tree->SetBranchAddress("hit",&hits);
  const int count=std::string(channel)=="ep_inelastic"?3:1;
  struct Moments {
    long long observed=0,nonzero=0;
    long double sum[3][3]{},square[3][3]{};
  };
  std::map<int,Moments> strata;
  long double main_check[3]{};
  for (long long entry=0;entry<entries;++entry) {
    tree->GetEntry(entry);
    if (!event||!parts||!hits||!std::isfinite(rate)||rate<0) throw std::runtime_error("Invalid history");
    const auto* electron=universal_gate_scan::selected_electron(*parts);
    int group=plan.stratum(electron?electron->p:-1,
      electron?std::atan2(std::hypot(electron->px,electron->py),electron->pz)*1000:-1);
    if (!plan.group.count(group)) throw std::runtime_error("Unmapped stratum");
    auto& m=strata[group];++m.observed;
    if (rate==0) continue;
    if (++m.nonzero>plan.group.at(group).quota) throw std::runtime_error("Quota exceeded");
    long double pe[3]{}; // open, closed, transition
    for (const auto& h:*hits) {
      if (h.det<73001||h.det>73028||h.pz<=0||!response_energy_available(h.pid,h.e)) continue;
      int slot=(h.det-73000)%4;
      int region=slot==3?0:slot==1?1:2;
      double score=rate*response(h.det,h.pid,h.e,h.x,h.y);
      if (!std::isfinite(score)||score<0) throw std::runtime_error("Invalid PE score");
      pe[region]+=score;
    }
    int active=0;
    if (count==3) {
      double w=event->W2>0?std::sqrt(event->W2)/1000:-1;
      active=w>=1&&w<1.4?0:w>=1.4&&w<2.5?1:w>=2.5&&w<6?2:-1;
    }
    if (active<0) {
      if (pe[0]+pe[1]+pe[2]>0) throw std::runtime_error("Unclassified ep-inelastic PE signal outside W bins");
      continue;
    }
    for (const auto& h:*hits) {
      int ring=ring_index(h.det);
      if (ring>=0&&ring<6) main_check[active]+=rate;
    }
    for (int r=0;r<3;++r) {m.sum[r][active]+=pe[r];m.square[r][active]+=pe[r]*pe[r];}
  }
  for (const auto& [g,p]:plan.group)
    if ((compact&&strata[g].observed!=p.quota)||(!compact&&strata[g].observed<p.quota))
      throw std::runtime_error("Incomplete quota");
  std::ofstream out(output_path);out<<std::setprecision(18);
  out<<"region\tcomponent\testimate\tvariance\tcovariance_with_total\n";
  for (int r=0;r<3;++r) for (int c=0;c<count;++c) {
    long double sum=0,var=0,cov=0;
    for (const auto& [g,p]:plan.group) {
      const auto& m=strata[g];long double n=p.quota,total=0;
      for (int j=0;j<count;++j) total+=m.sum[r][j];
      sum+=m.sum[r][c];
      var+=n/(n-1)*(m.square[r][c]-m.sum[r][c]*m.sum[r][c]/n);
      // Components are mutually exclusive within a generated history. This
      // retains their negative design covariance in the ratio uncertainty.
      cov+=n/(n-1)*(m.square[r][c]-m.sum[r][c]*total/n);
    }
    out<<r<<'\t'<<c<<'\t'<<double(sum)<<'\t'<<double(var)<<'\t'<<double(cov)<<'\n';
  }
  for (int c=0;c<count;++c)
    out<<3<<'\t'<<c<<'\t'<<double(main_check[c])<<"\t0\t0\n";
  if (!out) throw std::runtime_error("Cannot write moments");
  std::cout<<"SHOWERMAX_MOMENTS_OK "<<entries<<std::endl;
}
